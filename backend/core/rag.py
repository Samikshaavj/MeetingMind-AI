import json
from typing import List, Optional
from sqlalchemy.orm import Session
from fastembed import TextEmbedding
from database.models import Meeting, MeetingChunk

# Loads a fast, lightweight 384-dim embedding model locally (downloads once on first run)
embedding_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")


def get_embedding(text: str) -> List[float]:
    return list(embedding_model.embed([text]))[0].tolist()


def chunk_transcript(transcript: str, lines_per_chunk: int = 6, overlap: int = 1) -> List[str]:
    """Splits timestamped transcript lines into overlapping chunks so timestamps stay intact."""
    if not transcript:
        return []
    lines = [line.strip() for line in transcript.splitlines() if line.strip()]
    if not lines:
        return []

    chunks = []
    step = max(1, lines_per_chunk - overlap)
    for i in range(0, len(lines), step):
        chunk = "\n".join(lines[i : i + lines_per_chunk])
        chunks.append(chunk)
        if i + lines_per_chunk >= len(lines):
            break
    return chunks


def index_meeting_chunks(db: Session, meeting: Meeting):
    """Chunks a meeting's summary, action items, and transcript, then stores embeddings in pgvector."""
    # Clear old chunks if re-indexing
    db.query(MeetingChunk).filter(MeetingChunk.meeting_id == meeting.id).delete()

    raw_chunks = []

    # Chunk 0: High-level summary + action items
    overview = (
        f"MEETING #{meeting.id}: {meeting.title or 'Uploaded Meeting'} (Date: {meeting.created_at})\n"
        f"SUMMARY: {meeting.summary or 'None'}\n"
        f"ACTION ITEMS: {json.dumps(meeting.action_items or [])}"
    )
    raw_chunks.append(overview)

    # Chunks 1..N: Timestamped transcript segments
    for seg in chunk_transcript(meeting.transcript or ""):
        raw_chunks.append(f"[Meeting #{meeting.id} - {meeting.title or 'Uploaded Meeting'}]\n{seg}")

    # Batch-generate embeddings
    vectors = [v.tolist() for v in embedding_model.embed(raw_chunks)]

    for idx, (text, vec) in enumerate(zip(raw_chunks, vectors)):
        db.add(
            MeetingChunk(
                meeting_id=meeting.id,
                chunk_index=idx,
                content=text,
                embedding=vec,
            )
        )
    db.commit()


def search_relevant_chunks(
    db: Session,
    query: str,
    meeting_id: Optional[int] = None,
    top_k: int = 6,
) -> List[dict]:
    """Performs pgvector cosine similarity search to fetch the top-K most relevant chunks."""
    query_vec = get_embedding(query)

    q = db.query(MeetingChunk, Meeting).join(Meeting, MeetingChunk.meeting_id == Meeting.id)
    if meeting_id is not None:
        q = q.filter(MeetingChunk.meeting_id == meeting_id)

    results = (
        q.order_by(MeetingChunk.embedding.cosine_distance(query_vec))
        .limit(top_k)
        .all()
    )

    return [
        {
            "meeting_id": meeting.id,
            "title": meeting.title or f"Meeting #{meeting.id}",
            "created_at": str(meeting.created_at),
            "content": chunk.content,
        }
        for chunk, meeting in results
    ]