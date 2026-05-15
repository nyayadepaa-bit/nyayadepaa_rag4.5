"""
retrieval/compressor.py
-----------------------
Context compression: removes redundant content from retrieved chunks
to maximize useful information within the token budget.
"""

import logging
import re

logger = logging.getLogger(__name__)


def compress_context(context: str, max_chars: int = 4000) -> str:
    """
    Compress context by removing redundant whitespace, repeated blocks,
    and truncating to max_chars.
    """
    # Normalize whitespace
    context = re.sub(r'\n{3,}', '\n\n', context)
    context = re.sub(r' {2,}', ' ', context)

    # Remove repeated dashes/underscores/equals
    context = re.sub(r'[-=_]{10,}', '---', context)

    # Truncate to max_chars, breaking at sentence boundary
    if len(context) > max_chars:
        truncated = context[:max_chars]
        last_period = truncated.rfind('.')
        if last_period > max_chars * 0.7:
            truncated = truncated[:last_period + 1]
        context = truncated + "\n[Context truncated for brevity]"

    return context.strip()
