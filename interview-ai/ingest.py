#!/usr/bin/env python3
"""
Ingestion script for project documentation.
Run this to load the PDF and create the vector database.
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from rag import ingest_documents, PDF_PATH, CHROMA_DB_PATH


def main():
    """Main ingestion function."""
    # Load environment variables
    env_path = Path(__file__).parent / ".env.local"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()  # Load from system env or .env
    
    # Check for OpenAI API key
    if not os.getenv("OPENAI_API_KEY"):
        print("❌ Error: OPENAI_API_KEY environment variable not set")
        print("   Please set it in .env.local or export it in your shell")
        sys.exit(1)
    
    # Check if PDF exists
    if not PDF_PATH.exists():
        print(f"❌ Error: PDF not found at {PDF_PATH}")
        print("   Please place your project documentation PDF at that location")
        sys.exit(1)
    
    print(f"📄 Loading PDF from: {PDF_PATH}")
    print(f"💾 Will store vector DB at: {CHROMA_DB_PATH}")
    print()
    
    try:
        # Run ingestion
        ingest_documents()
        print()
        print("✅ Ingestion complete!")
        print(f"   Vector database created at: {CHROMA_DB_PATH}")
        print()
        print("Next steps:")
        print("  - Verify the database: ls -la", CHROMA_DB_PATH)
        print("  - Test retrieval: python -c \"from rag import query_rag; print(query_rag('architecture'))\"")
        
    except Exception as e:
        print(f"❌ Error during ingestion: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

