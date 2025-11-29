"""
RAG (Retrieval Augmented Generation) module for project documentation.
Handles document ingestion, chunking, and retrieval from vector store.
"""

import os
from pathlib import Path
from typing import List

from langchain_community.document_loaders import PyPDFLoader
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document


# Paths
DATA_DIR = Path(__file__).parent / "data"
PDF_PATH = DATA_DIR / "project_doc.pdf"
CHROMA_DB_PATH = DATA_DIR / "chroma_db"


def load_and_chunk_documents(
    pdf_path: Path = PDF_PATH,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> List[Document]:
    """
    Load PDF and split into chunks.
    
    Args:
        pdf_path: Path to PDF file
        chunk_size: Size of each text chunk
        chunk_overlap: Overlap between chunks for context continuity
    
    Returns:
        List of Document chunks
    """
    # Load PDF
    loader = PyPDFLoader(str(pdf_path))
    documents = loader.load()
    
    # Split into chunks
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
        separators=["\n\n", "\n", " ", ""],
    )
    chunks = text_splitter.split_documents(documents)
    
    return chunks


def ingest_documents(
    pdf_path: Path = PDF_PATH,
    persist_directory: Path = CHROMA_DB_PATH,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> Chroma:
    """
    Ingest documents into ChromaDB vector store.
    
    Args:
        pdf_path: Path to PDF file
        persist_directory: Where to persist the vector DB
        chunk_size: Size of each text chunk
        chunk_overlap: Overlap between chunks
    
    Returns:
        Chroma vector store instance
    """
    # Ensure OPENAI_API_KEY is set
    if not os.getenv("OPENAI_API_KEY"):
        raise ValueError(
            "OPENAI_API_KEY environment variable must be set for embeddings"
        )
    
    # Load and chunk documents
    chunks = load_and_chunk_documents(pdf_path, chunk_size, chunk_overlap)
    
    print(f"Split {len(set(doc.metadata.get('source') for doc in chunks))} documents into {len(chunks)} chunks")
    
    # Create embeddings
    embeddings = OpenAIEmbeddings()
    
    # Create and persist vector store
    vectorstore = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=str(persist_directory),
    )
    
    print(f"Stored {len(chunks)} chunks in Chroma at {persist_directory}")
    
    return vectorstore


def get_retriever(
    persist_directory: Path = CHROMA_DB_PATH,
    k: int = 4,
):
    """
    Get retriever from existing ChromaDB.
    
    Args:
        persist_directory: Path to ChromaDB
        k: Number of documents to retrieve
    
    Returns:
        Retriever instance
    """
    if not persist_directory.exists():
        raise FileNotFoundError(
            f"ChromaDB not found at {persist_directory}. Run ingest.py first."
        )
    
    # Ensure OPENAI_API_KEY is set
    if not os.getenv("OPENAI_API_KEY"):
        raise ValueError(
            "OPENAI_API_KEY environment variable must be set for embeddings"
        )
    
    embeddings = OpenAIEmbeddings()
    
    vectorstore = Chroma(
        persist_directory=str(persist_directory),
        embedding_function=embeddings,
    )
    
    return vectorstore.as_retriever(search_kwargs={"k": k})


def deduplicate_documents(docs: List[Document]) -> List[Document]:
    """
    Remove duplicate documents from retrieval results.
    
    Uses content fingerprinting to identify exact and near-exact duplicates
    caused by chunk overlap. Fast and effective for RAG retrieval.
    
    Args:
        docs: List of retrieved Document objects
    
    Returns:
        List of unique documents (order preserved)
    """
    seen = set()
    unique_docs = []
    
    for doc in docs:
        # Use first 150 chars as fingerprint (covers most overlap cases)
        # Normalize whitespace for better matching
        fingerprint = " ".join(doc.page_content[:150].strip().split())
        
        if fingerprint not in seen:
            seen.add(fingerprint)
            unique_docs.append(doc)
    
    return unique_docs


def query_rag(query: str, k: int = 4, deduplicate: bool = True) -> str:
    """
    Query the RAG system and return relevant context.
    
    Args:
        query: Question or search query
        k: Number of unique documents to retrieve
        deduplicate: Whether to remove duplicate chunks (default: True)
    
    Returns:
        Concatenated relevant document chunks
    """
    # Load environment variables if not already loaded
    from dotenv import load_dotenv
    env_path = Path(__file__).parent / ".env.local"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()
    
    # Retrieve more if deduplicating (to ensure we get k unique chunks)
    retrieve_k = int(k * 1.5) if deduplicate else k
    retriever = get_retriever(k=retrieve_k)
    docs = retriever.invoke(query)
    
    # Deduplicate if enabled
    if deduplicate:
        docs = deduplicate_documents(docs)
        # Take top k after deduplication
        docs = docs[:k]
    
    # Concatenate retrieved documents
    context = "\n\n---\n\n".join([doc.page_content for doc in docs])
    
    return context

