import sys
import os
from sqlalchemy import text

# This helps Python find our files when we run this script directly
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.connection import engine, Base
from database.models import Meeting

print("Connecting to Neon Database...")

with engine.connect() as conn:
    # 1. Turn on the AI vector features in PostgreSQL
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
    conn.commit()
    print("AI pgvector extension enabled!")

# 2. Push our Python Meeting model to the cloud and create the table
Base.metadata.create_all(bind=engine)
print("Database tables created successfully!")