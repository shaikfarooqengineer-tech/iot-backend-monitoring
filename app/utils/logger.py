import logging
import sys

from app.config import settings


def setup_logger() -> logging.Logger:
    logger = logging.getLogger("hospital_backend")

    if logger.handlers:
        return logger

    logger.setLevel(settings.log_level)

    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    logger.addHandler(handler)

    return logger


logger = setup_logger()