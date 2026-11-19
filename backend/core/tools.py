import json
from typing import Optional
from sqlalchemy.orm import Session
from database.models import Meeting
from core.rag import search_relevant_chunks

# --- 1. Tool Schemas (Passed to Groq) ---

AGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_transcripts",
            "description": (
                "Semantic vector search across meeting transcripts, summaries, and discussions. "
                "Use this for open-ended questions, finding what someone said, decisions, or timestamps."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The semantic search query to look up in the meeting transcripts."
                    },
                    "meeting_id": {
                        "type": "integer",
                        "description": "Optional specific meeting ID to restrict the search to. Omit if searching all meetings."
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "query_tasks",
            "description": (
                "Exact SQL filter for action items/tasks across meetings. "
                "Use this when the user asks to list, count, or filter tasks by owner, priority, approval status, or completion status."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "meeting_id": {
                        "type": "integer",
                        "description": "Optional specific meeting ID. Omit if querying all meetings."
                    },
                    "owner": {
                        "type": "string",
                        "description": "Optional person's name to filter tasks by (case-insensitive partial match)."
                    },
                    "priority": {
                        "type": "string",
                        "enum": ["High", "Medium", "Low"],
                        "description": "Optional priority level filter."
                    },
                    "approved": {
                        "type": "boolean",
                        "description": "Filter by whether the task has been approved (true/false)."
                    },
                    "completed": {
                        "type": "boolean",
                        "description": "Filter by whether the task is completed (true/false)."
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "draft_followup_email",
            "description": (
                "Drafts a follow-up or reminder email for human approval. "
                "Does NOT send the email immediately. Use this when the user asks to write, draft, or send a follow-up or reminder email."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "recipient_name": {
                        "type": "string",
                        "description": "Name of the person receiving the email."
                    },
                    "recipient_email": {
                        "type": "string",
                        "description": "Email address of the recipient if known, otherwise empty string."
                    },
                    "subject": {
                        "type": "string",
                        "description": "Clear, concise email subject line."
                    },
                    "body": {
                        "type": "string",
                        "description": "Professional, well-formatted email body referencing the meeting and action items."
                    }
                },
                "required": ["recipient_name", "subject", "body"]
            }
        }
    }
]


# --- 2. Tool Implementations ---

def execute_search_transcripts(db: Session, query: str, meeting_id: Optional[int] = None) -> str:
    chunks = search_relevant_chunks(db, query=query, meeting_id=meeting_id, top_k=6)
    if not chunks:
        return json.dumps({"message": "No matching transcript excerpts found."})
    return json.dumps(chunks)


def execute_query_tasks(
    db: Session,
    meeting_id: Optional[int] = None,
    owner: Optional[str] = None,
    priority: Optional[str] = None,
    approved: Optional[bool] = None,
    completed: Optional[bool] = None,
) -> str:
    q = db.query(Meeting).order_by(Meeting.created_at.desc())
    if meeting_id is not None:
        q = q.filter(Meeting.id == meeting_id)

    meetings = q.all()
    matched_tasks = []

    for m in meetings:
        items = m.action_items or []
        if not isinstance(items, list):
            continue
        for idx, item in enumerate(items):
            if not isinstance(item, dict):
                continue

            item_owner = (item.get("owner") or item.get("assigned_to") or "Unassigned")
            item_priority = (item.get("priority") or "Medium")
            item_approved = bool(item.get("approved", False))
            item_completed = bool(item.get("completed", False))

            if owner and owner.lower() not in item_owner.lower():
                continue
            if priority and priority.lower() != item_priority.lower():
                continue
            if approved is not None and item_approved != approved:
                continue
            if completed is not None and item_completed != completed:
                continue

            matched_tasks.append({
                "meeting_id": m.id,
                "meeting_title": m.title or f"Meeting #{m.id}",
                "date": str(m.created_at),
                "task_index": idx,
                "task": item.get("task") or item.get("description") or "",
                "owner": item_owner,
                "deadline": item.get("deadline") or item.get("due_date") or "None",
                "priority": item_priority,
                "approved": item_approved,
                "completed": item_completed,
            })

    return json.dumps({
        "total_matched": len(matched_tasks),
        "tasks": matched_tasks
    })


def run_tool(name: str, arguments: dict, db: Session, default_meeting_id: Optional[int] = None) -> str:
    # Enforce scoped meeting_id if the user selected a specific meeting in the UI
    scoped_meeting_id = arguments.get("meeting_id") or default_meeting_id

    if name == "search_transcripts":
        return execute_search_transcripts(
            db=db,
            query=arguments.get("query") or "",
            meeting_id=scoped_meeting_id,
        )
    elif name == "query_tasks":
        return execute_query_tasks(
            db=db,
            meeting_id=scoped_meeting_id,
            owner=arguments.get("owner"),
            priority=arguments.get("priority"),
            approved=arguments.get("approved"),
            completed=arguments.get("completed"),
        )
    elif name == "draft_followup_email":
        return json.dumps({
            "status": "pending_approval",
            "draft": {
                "recipient_name": arguments.get("recipient_name") or "",
                "recipient_email": arguments.get("recipient_email") or "",
                "subject": arguments.get("subject") or "",
                "body": arguments.get("body") or "",
                "meeting_id": default_meeting_id,
            }
        })
    return json.dumps({"error": f"Unknown tool: {name}"})