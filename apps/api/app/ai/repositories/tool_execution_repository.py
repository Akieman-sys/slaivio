import json

from sqlalchemy import text

from app.db.database import engine


def record_tool_execution(*,org_id:str,workspace_id:str|None,tool_name:str,actor_id:str|None,
                          idempotency_key:str,input_payload:dict,output_payload:dict|None=None,
                          status:str="SUCCEEDED",risk_level:str="LOW",error_code:str|None=None):
    try:
      with engine.begin() as conn:
        row=conn.execute(text("""insert into ai_tool_executions(
          org_id,workspace_id,tool_name,risk_level,input_payload,output_payload,status,
          idempotency_key,actor_id,error_code,completed_at)
          values(:o,:w,:tool,:risk,cast(:input as jsonb),cast(:output as jsonb),:status,:key,:actor,:error,
                 case when :status in('SUCCEEDED','FAILED','BLOCKED') then now() else null end)
          on conflict(org_id,idempotency_key) do update set output_payload=excluded.output_payload,
          status=excluded.status,error_code=excluded.error_code,completed_at=excluded.completed_at
          returning *"""),{"o":org_id,"w":workspace_id,"tool":tool_name,"risk":risk_level,
            "input":json.dumps(input_payload,default=str),"output":json.dumps(output_payload or {},default=str),
            "status":status,"key":idempotency_key,"actor":actor_id,"error":error_code}).mappings().one()
        return dict(row)
    except Exception:
        # Audit must not make the business answer unavailable during a rolling
        # deployment where migration 089 has not reached every environment yet.
        return None
