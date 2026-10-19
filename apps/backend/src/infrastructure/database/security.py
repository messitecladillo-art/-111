"""Migration-owned SQL security; the running API never creates tables."""
from sqlalchemy import text


def install_security(connection):
    # Unqualified names resolve to the migration's schema/search_path.
    # Auth and membership metadata are read by narrowly bounded API operations;
    # RLS additionally protects project content, private vault and invocation data.
    policies = {
        "projects": "EXISTS(SELECT 1 FROM memberships m WHERE m.team_id=projects.team_id AND m.user_id=current_setting('evix.user_id',true))",
        "questionnaire_versions": "EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id WHERE p.id=questionnaire_versions.project_id AND m.user_id=current_setting('evix.user_id',true))",
        "services": "user_id=current_setting('evix.user_id',true)",
        "operations": "user_id=current_setting('evix.user_id',true)",
        "proposals": "user_id=current_setting('evix.user_id',true)",
    }
    for table, predicate in policies.items():
        connection.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
        connection.execute(text(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY"))
        if table == "projects":
            editable = "EXISTS(SELECT 1 FROM memberships m WHERE m.team_id=projects.team_id AND m.user_id=current_setting('evix.user_id',true) AND m.role IN ('owner','editor'))"
            connection.execute(text(f"CREATE POLICY scoped_read ON {table} FOR SELECT USING ({predicate})"))
            connection.execute(text(f"CREATE POLICY scoped_insert ON {table} FOR INSERT WITH CHECK ({editable})"))
            connection.execute(text(f"CREATE POLICY scoped_update ON {table} FOR UPDATE USING ({editable}) WITH CHECK ({editable})"))
        elif table == "questionnaire_versions":
            editable = "EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id WHERE p.id=questionnaire_versions.project_id AND m.user_id=current_setting('evix.user_id',true) AND m.role IN ('owner','editor'))"
            connection.execute(text(f"CREATE POLICY scoped_read ON {table} FOR SELECT USING ({predicate})"))
            connection.execute(text(f"CREATE POLICY scoped_insert ON {table} FOR INSERT WITH CHECK ({editable})"))
        else:
            connection.execute(text(f"CREATE POLICY scoped_access ON {table} USING ({predicate}) WITH CHECK ({predicate})"))
    connection.execute(text("""
        CREATE FUNCTION evix_immutable_version() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'questionnaire versions are immutable'; END; $$
    """))
    connection.execute(text("CREATE TRIGGER immutable_versions BEFORE UPDATE OR DELETE ON questionnaire_versions FOR EACH ROW EXECUTE FUNCTION evix_immutable_version()"))
