from app.knowledge.repository import maintenance


def main():
    result = maintenance()
    print(f"knowledge_maintenance:expired={result['expired']}:needs_review={result['needs_review']}")


if __name__ == "__main__":
    main()
