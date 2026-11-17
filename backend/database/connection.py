import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Load the connection string from the .env file
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("No DATABASE_URL found. Check your .env file!")

# The engine is the actual connection to Neon
engine = create_engine(DATABASE_URL)

# The SessionLocal is what we use to actually send queries to the database
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# This Base class is what we will use to build our data tables in the next step
Base = declarative_base()

# A helper function to get a database connection for our API routes
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()