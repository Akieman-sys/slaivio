from app.db.broadcast_repository import process_queue
def main():print({'processed':process_queue(200)})
if __name__=='__main__':main()
