"""Render cron entrypoint for follow-up detection and delivery."""

import os

os.environ["APP_RUNTIME"] = "cron"

from app.db.followup_repository import process_attempt_queue,advance_sequences,detect_all_organizations
def main():print({'detected':detect_all_organizations(),'advanced':advance_sequences(),'processed':process_attempt_queue(100)})
if __name__=='__main__':main()
