"""
Tools for the interview agent.
Provides RAG search and feedback generation capabilities.
"""

import sys
import logging
from typing import Annotated
from livekit.agents import function_tool
from rag import query_rag

# Get logger - this will integrate with LiveKit's logging system
logger = logging.getLogger(__name__)


@function_tool
async def search_project_docs(
    query: Annotated[
        str,
        "The search query to find relevant information from the project documentation",
    ]
) -> str:
    """
    Search the project documentation for relevant information.
    
    Use this tool to look up details about the user's project when you need
    to ask specific, informed questions during the technical interview.
    
    Args:
        query: What to search for in the documentation
    
    Returns:
        Relevant excerpts from the project documentation
    """
    try:
        logger.info(f"🔍 Tool called: search_project_docs")
        logger.info(f"   Query: {query}")
        
        context = query_rag(query, k=4, deduplicate=True)
        
        if not context or len(context.strip()) == 0:
            logger.info(f"   Result: No relevant information found")
            return f"No relevant information found for query: {query}"
        
        # Format the result nicely
        result = f"Project Documentation Context:\n\n{context}"
        logger.info(f"   Result: Retrieved {len(context)} characters of context")
        return result
    
    except Exception as e:
        logger.error(f"   ❌ Error: {str(e)}")
        return f"Error searching documentation: {str(e)}"


@function_tool
async def generate_feedback(
    strengths: Annotated[
        str,
        "What the candidate did well in their explanations",
    ],
    areas_for_improvement: Annotated[
        str,
        "Areas where the candidate could improve or provide more detail",
    ],
    rating: Annotated[
        int,
        "Overall rating from 1-10 for the technical interview performance",
    ]
) -> str:
    """
    Generate structured feedback for the candidate at the end of the interview.
    
    Use this tool to provide comprehensive feedback on the candidate's
    technical interview performance.
    
    Args:
        strengths: Positive aspects of the interview
        areas_for_improvement: Constructive feedback
        rating: Numeric rating (1-10)
    
    Returns:
        Formatted feedback summary
    """
    try:
        # Use stderr to ensure output appears (LiveKit may redirect stdout)
        print(f"\n📝 Tool called: generate_feedback", file=sys.stderr, flush=True)
        print(f"   Rating: {rating}/10", file=sys.stderr, flush=True)
        print(f"   Strengths: {strengths[:60]}{'...' if len(strengths) > 60 else ''}", file=sys.stderr, flush=True)
        print(f"   Improvements: {areas_for_improvement[:60]}{'...' if len(areas_for_improvement) > 60 else ''}", file=sys.stderr, flush=True)
        
        # Validate rating
        if not (1 <= rating <= 10):
            rating = max(1, min(10, rating))  # Clamp to valid range
        
        feedback = f"""
Interview Feedback Summary
==========================

RATING: {rating}/10

STRENGTHS:
{strengths}

AREAS FOR IMPROVEMENT:
{areas_for_improvement}

Thank you for participating in this technical interview!
"""
        print(f"   ✅ Feedback generated successfully", file=sys.stderr, flush=True)
        return feedback.strip()
    
    except Exception as e:
        print(f"   ❌ Error: {str(e)}", file=sys.stderr, flush=True)
        return f"Error generating feedback: {str(e)}"

