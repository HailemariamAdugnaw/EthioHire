"""ExamSession.scheduledAt becomes nullable — the exam record is now
provisioned automatically when a job is created (symmetric with the default
Interview Setup record) in an "unscheduled" state; scheduling happens in the
Exams module. Un-scheduled sessions behave exactly like no session at all for
candidates (exam can be taken immediately) and read-only for recruiters."""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("eh", "0007_interviewschedule_sessionstate_evaltemplate_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="examsession",
            name="scheduledAt",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
