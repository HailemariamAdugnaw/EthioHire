# Per-question candidate visibility for the dedicated interview question bank
# (granular overrides on top of JobPosting.interviewQuestionVisibility).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eh', '0004_interviewevaluation_releasedat_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='interviewquestion',
            name='visibleToCandidate',
            field=models.BooleanField(default=True),
        ),
    ]
