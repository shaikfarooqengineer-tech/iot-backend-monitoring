import logging
import sys

def setup_logger() -> logging.Logger:
    logger = logging.getLogger("hospital_backend")
    logger.setLevel(logging.INFO)
    
    formatter = logging.Formatter(
        '[%(asctime)s] [%(levelname)s] [%(filename)s:%(lineno)d] - %(message)s'
    )
    
    # Stream Handler for Standard Output
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(formatter)
    
    if not logger.handlers:
        logger.addHandler(sh)
        
    return logger

logger = setup_logger()