from app.departures.repository import run_automation

if __name__ == '__main__':
    result=run_automation()
    print(f"departure_automation generated={result['generated']} reminders={result['reminders']}")
