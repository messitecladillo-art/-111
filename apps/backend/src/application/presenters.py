"""Serialize application results without depending on the HTTP framework."""
from datetime import timezone

def iso(value):
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

def project_view(p):
    return {"id": p.id, "title": p.title, "teamId": p.team_id, "revision": p.revision, "createdAt": iso(p.created_at)}

def head(v):
    return {"id": v.id, "projectId": v.project_id, "revision": v.revision, "design": v.design, "updatedAt": iso(v.created_at)}

def proposal_view(p):
    result = {"id": p.id, "projectId": p.project_id, "serviceId": p.service_id, "serviceRevision": p.service_revision,
              "inputRevision": p.input_revision, "status": p.status, "createdAt": iso(p.created_at)}
    if p.design is not None:
        result["design"] = p.design
    if p.error_code:
        result["errorCode"] = p.error_code
    return result

def silicon_view(run, full=False):
    result = {"id": run.id, "projectId": run.project_id, "status": run.status, "done": run.done, "total": run.total,
              "services": run.services, "classification": "simulated", "createdAt": iso(run.created_at),
              "personas": len(run.plan["personas"]), "scenarios": len(run.plan["scenarios"]), "memory": run.plan["memory"],
              "title": run.plan["design"]["title"]}
    if run.finished_at:
        result["finishedAt"] = iso(run.finished_at)
    if run.error_code:
        result["errorCode"] = run.error_code
    if full:
        result["responses"] = run.responses
    return result
