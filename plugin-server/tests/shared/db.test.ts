import { Properties } from '@posthog/plugin-scaffold'
import { DateTime } from 'luxon'

import { Hub, Person, PersonPropertyUpdateOperation, PropertyOperator, Team } from '../../src/types'
import { DB } from '../../src/utils/db/db'
import { createHub } from '../../src/utils/db/hub'
import { UUIDT } from '../../src/utils/utils'
import { ActionManager } from '../../src/worker/ingestion/action-manager'
import { getFirstTeam, resetTestDatabase } from '../helpers/sql'

jest.mock('../../src/utils/status')

describe('DB', () => {
    let hub: Hub
    let closeServer: () => Promise<void>
    let db: DB

    beforeEach(async () => {
        ;[hub, closeServer] = await createHub()
        await resetTestDatabase()
        db = hub.db
    })

    afterEach(async () => {
        await closeServer()
    })

    const TEAM_ID = 2
    const ACTION_ID = 69
    const ACTION_STEP_ID = 913

    test('fetchAllActionsGroupedByTeam', async () => {
        const action = await db.fetchAllActionsGroupedByTeam()

        expect(action).toMatchObject({
            [TEAM_ID]: {
                [ACTION_ID]: {
                    id: ACTION_ID,
                    name: 'Test Action',
                    deleted: false,
                    post_to_slack: true,
                    slack_message_format: '',
                    is_calculating: false,
                    steps: [
                        {
                            id: ACTION_STEP_ID,
                            action_id: ACTION_ID,
                            tag_name: null,
                            text: null,
                            href: null,
                            selector: null,
                            url: null,
                            url_matching: null,
                            name: null,
                            event: null,
                            properties: [
                                { type: 'event', operator: PropertyOperator.Exact, key: 'foo', value: ['bar'] },
                            ],
                        },
                    ],
                },
            },
        })
    })

    describe('fetchGroupTypes() and insertGroupType()', () => {
        it('fetches group types that have been inserted', async () => {
            expect(await db.fetchGroupTypes(2)).toEqual({})
            expect(await db.insertGroupType(2, 'g0', 0)).toEqual(0)
            expect(await db.insertGroupType(2, 'g1', 1)).toEqual(1)
            expect(await db.fetchGroupTypes(2)).toEqual({ g0: 0, g1: 1 })
        })

        it('handles conflicting by index when inserting and limits', async () => {
            expect(await db.insertGroupType(2, 'g0', 0)).toEqual(0)
            expect(await db.insertGroupType(2, 'g1', 0)).toEqual(1)
            expect(await db.insertGroupType(2, 'g2', 0)).toEqual(2)
            expect(await db.insertGroupType(2, 'g3', 1)).toEqual(3)
            expect(await db.insertGroupType(2, 'g4', 0)).toEqual(4)
            expect(await db.insertGroupType(2, 'g5', 0)).toEqual(null)
            expect(await db.insertGroupType(2, 'g6', 0)).toEqual(null)

            expect(await db.fetchGroupTypes(2)).toEqual({ g0: 0, g1: 1, g2: 2, g3: 3, g4: 4 })
        })

        it('handles conflict by name when inserting', async () => {
            expect(await db.insertGroupType(2, 'group_name', 0)).toEqual(0)
            expect(await db.insertGroupType(2, 'group_name', 0)).toEqual(0)
            expect(await db.insertGroupType(2, 'group_name', 0)).toEqual(0)
            expect(await db.insertGroupType(2, 'foo', 0)).toEqual(1)
            expect(await db.insertGroupType(2, 'foo', 0)).toEqual(1)

            expect(await db.fetchGroupTypes(2)).toEqual({ group_name: 0, foo: 1 })
        })
    })

    describe('updatePersonProperties', () => {
        //  How we expect this query to behave:
        //    | value exists | method   | previous method | previous TS is ___ call TS | write/override
        //  1 | no           | N/A      | N/A             | N/A                        | yes
        //  2 | yes          | set      | set             | before                     | yes
        //  3 | yes          | set_once | set             | before                     | no
        //  4 | yes          | set      | set_once        | before                     | yes
        //  5 | yes          | set_once | set_once        | before                     | no
        //  6 | yes          | set      | set             | equal                      | no
        //  7 | yes          | set_once | set             | equal                      | no
        //  8 | yes          | set      | set_once        | equal                      | yes
        //  9 | yes          | set_once | set_once        | equal                      | no
        // 10 | yes          | set      | set             | after                      | no
        // 11 | yes          | set_once | set             | after                      | no
        // 12 | yes          | set      | set_once        | after                      | yes
        // 13 | yes          | set_once | set_once        | after                      | yes

        let team: Team
        let person: Person
        const uuid = new UUIDT().toString()
        const distinct_id = 'distinct_id_update_person_properties'

        const FUTURE_TIMESTAMP = DateTime.fromISO('2050-10-14T11:42:06.502Z')
        const PAST_TIMESTAMP = DateTime.fromISO('2000-10-14T11:42:06.502Z')

        beforeEach(async () => {
            team = await getFirstTeam(hub)
            person = await db.createPerson(PAST_TIMESTAMP, {}, team.id, null, false, uuid, [distinct_id])
        })

        // util to get the new props after an update
        async function updatePersonProperties(
            properties: Properties,
            propertiesOnce: Properties,
            timestamp: DateTime // todo: do I need to be doing any kind of timestamp conversions?
        ): Promise<Person['properties'] | undefined> {
            await db.updatePersonProperties(team.id, distinct_id, properties, propertiesOnce, timestamp)
            return (await db.fetchPersonByPersonId(team.id, person.id))?.properties
        }

        test('update non-existent single property', async () => {
            const props = await updatePersonProperties({ a: 'a' }, {}, PAST_TIMESTAMP)
            expect(props).toEqual({ a: 'a' })
            //expect(true).toEqual(false)
        })

        test('update non-existent property', async () => {
            const props = await updatePersonProperties({ a: 'a' }, { b: 'b' }, PAST_TIMESTAMP)
            expect(props).toEqual({ a: 'a', b: 'b' })
        })

        test('update with newer timestamp - rows [2-5]', async () => {
            // setup
            let props = await updatePersonProperties({ r2: 'a', r3: 'b' }, { r4: 'c', r5: 'd' }, PAST_TIMESTAMP)
            expect(props).toEqual({ r2: 'a', r3: 'b', r4: 'c', r5: 'd' })
            // update
            props = await updatePersonProperties({ r2: 'A', r4: 'C' }, { r3: 'B', r5: 'D' }, FUTURE_TIMESTAMP)
            expect(props).toEqual({ r2: 'A', r3: 'b', r4: 'C', r5: 'd' })
        })

        test('update with equal timestamp - rows [6-9] ', async () => {
            // setup
            let props = await updatePersonProperties({ r6: 'a', r7: 'b' }, { r8: 'c', r9: 'd' }, PAST_TIMESTAMP)
            expect(props).toEqual({ r6: 'a', r7: 'b', r8: 'c', r9: 'd' })
            // update
            props = await updatePersonProperties({ r6: 'A', r8: 'C' }, { r7: 'B', r9: 'D' }, PAST_TIMESTAMP)
            expect(props).toEqual({ r6: 'a', r7: 'b', r8: 'C', r9: 'd' })
        })

        test('update with older timestamp - rows [10-13] ', async () => {
            // setup
            let props = await updatePersonProperties({ r10: 'a', r11: 'b' }, { r12: 'c', r13: 'd' }, FUTURE_TIMESTAMP)
            expect(props).toEqual({ r10: 'a', r11: 'b', r12: 'c', r13: 'd' })
            // update
            props = await updatePersonProperties({ r10: 'A', r12: 'C' }, { r11: 'B', r13: 'D' }, PAST_TIMESTAMP)
            expect(props).toEqual({ r10: 'a', r11: 'b', r12: 'C', r13: 'D' })
        })
    })
})
