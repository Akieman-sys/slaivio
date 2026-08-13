from app.db.followup_repository import process_attempt_queue
def main():print({'processed':process_attempt_queue(100)})
if __name__=='__main__':main()
