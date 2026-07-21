#  ══════════════════════════════════════════════════════════════════════════════
# FILE: backend/app/utils/logger.py
#  ══════════════════════════════════════════════════════════════════════════════

import logging
import sys
from app.config import settings

def setup_logger() -> logging.Logger:
    """
    Sets up a robust custom logger that outputs structured logs directly
    to standard output (terminal console), completely safe from Uvicorn's stream hijacking.
    """
    logger = logging.getLogger("hospital_backend")
    
    # CRITICAL: Under Uvicorn hot-reload (--reload), sys.stdout is redirected/replaced.
    # We must clear existing stale handlers to force-bind a new StreamHandler to the active stdout stream.
    if logger.handlers:
        for handler in list(logger.handlers):
            logger.removeHandler(handler)
            
    # Create a StreamHandler directing logs to the active stdout stream
    sh = logging.StreamHandler(sys.stdout)
    
    # Set a clear, readable structured format
    formatter = logging.Formatter(
        fmt='[%(asctime)s] [%(levelname)s] [%(filename)s:%(lineno)d] - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    sh.setFormatter(formatter)
    
    # Get configuration level from environment settings
    raw_level = getattr(settings, "log_level", "INFO")
    level = getattr(logging, raw_level.upper(), logging.INFO)
    
    # Apply levels to both the logger and the direct handler to prevent drop-rules
    sh.setLevel(level)
    logger.setLevel(level)
    logger.addHandler(sh)
    
    # CRITICAL: Prevent log double-propagation up to Uvicorn's root handler.
    # This guarantees your logs bypass Uvicorn's custom filters and print reliably.
    logger.propagate = False
        
    return logger

# Initialize the global logger instance
logger = setup_logger()