import { useValues } from 'kea'
import { CodeSnippet, Language } from 'lib/components/CodeSnippet'
import { Link } from 'lib/lemon-ui/Link'
import { teamLogic } from 'scenes/teamLogic'

export function JSInstallSnippet(): JSX.Element {
    return (
        <CodeSnippet language={Language.Bash}>
            {['npm install posthog-js', '# OR', 'yarn add posthog-js', '# OR', 'pnpm add posthog-js'].join('\n')}
        </CodeSnippet>
    )
}

export function JSSetupSnippet(): JSX.Element {
    const { currentTeam } = useValues(teamLogic)

    return (
        <CodeSnippet language={Language.JavaScript}>
            {[
                "import posthog from 'posthog-js'",
                '',
                `posthog.init('${currentTeam?.api_token}', { api_host: '${window.location.origin}' })`,
            ].join('\n')}
        </CodeSnippet>
    )
}

export function SessionReplayFinalSteps(): JSX.Element {
    return (
        <>
            <h3>Optional: Configure</h3>
            <p>
                Advanced users can add{' '}
                <Link to="https://posthog.com/docs/libraries/js#config" target="_blank">
                    configuration options
                </Link>{' '}
                to customize text masking, customize or disable event capturing, and more.
            </p>
            <h3>Create a recording</h3>
            <p>Visit your site and click around to generate an initial recording.</p>
        </>
    )
}
