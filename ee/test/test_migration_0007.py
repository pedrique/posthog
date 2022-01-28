from posthog.test.base import TestMigrations


class TagsTestCase(TestMigrations):

    migrate_from = "0006_event_definition_verification"
    migrate_to = "0007_migrate_definitions_tags"

    def setUpBeforeMigration(self, apps):
        EnterpriseEventDefinition = apps.get_model("ee", "EnterpriseEventDefinition")
        self.event_definition = EnterpriseEventDefinition.objects.create(
            team_id=self.team.id, name="enterprise event", tags=["a", "b", "c"]
        ).id
        EnterprisePropertyDefinition = apps.get_model("ee", "EnterprisePropertyDefinition")
        self.property_definition_with_tags = EnterprisePropertyDefinition.objects.create(
            team_id=self.team.id, name="property def with tags", tags=["b", "c", "d", "e"]
        ).id
        self.property_definition_without_tags = EnterprisePropertyDefinition.objects.create(
            team_id=self.team.id, name="property def without tags",
        ).id

    def test_tags_migrated(self):
        EnterpriseTaggedItem = self.apps.get_model("posthog", "EnterpriseTaggedItem")

        event_definition_tags = EnterpriseTaggedItem.objects.filter(object_id=self.event_definition)
        self.assertEqual(event_definition_tags.count(), 3)
        self.assertEqual(list(event_definition_tags.values_list("tag", flat=True)), ["a", "b", "c"])

        property_definition_with_tags_tags = EnterpriseTaggedItem.objects.filter(
            object_id=self.property_definition_with_tags
        )
        self.assertEqual(property_definition_with_tags_tags.count(), 4)
        self.assertEqual(list(property_definition_with_tags_tags.values_list("tag", flat=True)), ["b", "c", "d", "e"])

        property_definition_without_tags_tags = EnterpriseTaggedItem.objects.filter(
            object_id=self.property_definition_without_tags
        )
        self.assertEqual(property_definition_without_tags_tags.count(), 0)

        self.assertEqual(EnterpriseTaggedItem.objects.all().count(), 7)
        self.assertEqual(EnterpriseTaggedItem.objects.order_by("tag").values("tag").distinct().count(), 5)

    def tearDown(self):
        EnterpriseEventDefinition = self.apps.get_model("ee", "EnterpriseEventDefinition")
        EnterpriseEventDefinition.objects.filter(id=self.event_definition).delete()
        EnterprisePropertyDefinition = self.apps.get_model("ee", "EnterprisePropertyDefinition")
        EnterprisePropertyDefinition.objects.filter(
            id__in=[self.property_definition_with_tags, self.property_definition_without_tags]
        ).delete()
