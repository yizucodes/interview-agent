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
        logger.info(f"Searching project docs: {query}")
        
        context = query_rag(query, k=4, deduplicate=True)
        
        if not context or len(context.strip()) == 0:
            return f"No relevant information found for query: {query}"
        
        return f"Project Documentation Context:\n\n{context}"
    
    except Exception as e:
        logger.error(f"Error searching documentation: {str(e)}")
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
        logger.info(f"Generating feedback: rating={rating}/10")
        
        # Validate rating
        if not (1 <= rating <= 10):
            rating = max(1, min(10, rating))
        
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
        return feedback.strip()
    
    except Exception as e:
        logger.error(f"Error generating feedback: {str(e)}")
        return f"Error generating feedback: {str(e)}"

