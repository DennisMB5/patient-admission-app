import re
import sqlite3
from datetime import date, datetime

from fastapi import Body, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI(title="Patient Admission API")

# Allow the React app (different domain) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_FILE = "patients.db"  # SQLite file -> data survives server restarts

# ---- Dropdown options (single source of truth, frontend fetches these) ----
OPTIONS = {
    "genders": ["Male", "Female", "Other"],
    "wards": ["General Ward", "ICU", "Maternity Ward", "Pediatric Ward", "Emergency Ward"],
    "departments": ["Cardiology", "Neurology", "Orthopedics", "Pediatrics", "General Medicine"],
    "doctors": ["Dr. Sharma", "Dr. Reddy", "Dr. Iyer", "Dr. Khan", "Dr. Patel"],
}


# ---- Database helpers ----
def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row  # rows behave like dicts
    return conn


def init_db():
    conn = get_db()
    conn.execute(
        """CREATE TABLE IF NOT EXISTS patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            age INTEGER NOT NULL,
            gender TEXT NOT NULL,
            ward TEXT NOT NULL,
            department TEXT NOT NULL,
            doctor TEXT NOT NULL,
            admission_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Admitted'
        )"""
    )
    conn.commit()
    conn.close()


init_db()


# ---- Validation: returns (clean_data, errors) ----
def validate(data: dict):
    errors = {}
    clean = {}

    # Name: required, letters only (spaces allowed between words)
    name = str(data.get("name") or "").strip()
    if not name:
        errors["name"] = "Name is required."
    elif not re.fullmatch(r"[A-Za-z]+( [A-Za-z]+)*", name):
        errors["name"] = "Name must contain letters only."
    else:
        clean["name"] = name

    # Age: required, whole number 0-120
    age = data.get("age")
    if age is None or str(age).strip() == "":
        errors["age"] = "Age is required."
    else:
        try:
            if isinstance(age, bool) or float(age) != int(float(age)):
                raise ValueError
            age = int(float(age))
            if 0 <= age <= 120:
                clean["age"] = age
            else:
                errors["age"] = "Age must be between 0 and 120."
        except (ValueError, TypeError):
            errors["age"] = "Age must be a valid number."

    # Select fields: required and must be from the list
    for field, key in [("gender", "genders"), ("ward", "wards"),
                       ("department", "departments"), ("doctor", "doctors")]:
        value = data.get(field)
        if not value:
            errors[field] = f"{field.capitalize()} is required."
        elif value not in OPTIONS[key]:
            errors[field] = f"Invalid {field}. Choose from the list."
        else:
            clean[field] = value

    # Admission date: required, valid, not in the future
    adm = data.get("admission_date")
    if not adm:
        errors["admission_date"] = "Admission date is required."
    else:
        try:
            d = datetime.strptime(str(adm), "%Y-%m-%d").date()
            if d > date.today():
                errors["admission_date"] = "Admission date cannot be in the future."
            else:
                clean["admission_date"] = str(adm)
        except ValueError:
            errors["admission_date"] = "Admission date must be a valid date (YYYY-MM-DD)."

    return clean, errors


def error_response(errors):
    return JSONResponse({"error": "Validation failed", "errors": errors}, status_code=400)


def not_found():
    return JSONResponse({"error": "Patient not found."}, status_code=404)


# ---- Routes ----
@app.get("/api/options")
def get_options():
    return OPTIONS


@app.get("/api/patients")
def list_patients(
    search: str = Query(""),
    ward: str = Query(""),
    department: str = Query(""),
    doctor: str = Query(""),
):
    # Optional filters: ?search=...&ward=...&department=...&doctor=...
    query = "SELECT * FROM patients WHERE 1=1"
    params = []

    if search.strip():
        query += " AND name LIKE ?"
        params.append(f"%{search.strip()}%")
    for field, value in [("ward", ward), ("department", department), ("doctor", doctor)]:
        if value.strip():
            query += f" AND {field} = ?"
            params.append(value.strip())

    query += " ORDER BY id DESC"
    conn = get_db()
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/patients", status_code=201)
def add_patient(data: dict = Body(...)):
    clean, errors = validate(data)
    if errors:
        return error_response(errors)

    conn = get_db()
    cur = conn.execute(
        """INSERT INTO patients (name, age, gender, ward, department, doctor, admission_date, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'Admitted')""",
        (clean["name"], clean["age"], clean["gender"], clean["ward"],
         clean["department"], clean["doctor"], clean["admission_date"]),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM patients WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return dict(row)


@app.put("/api/patients/{pid}")
def edit_patient(pid: int, data: dict = Body(...)):
    clean, errors = validate(data)
    if errors:
        return error_response(errors)

    conn = get_db()
    if not conn.execute("SELECT id FROM patients WHERE id = ?", (pid,)).fetchone():
        conn.close()
        return not_found()

    conn.execute(
        """UPDATE patients SET name=?, age=?, gender=?, ward=?, department=?, doctor=?, admission_date=?
           WHERE id=?""",
        (clean["name"], clean["age"], clean["gender"], clean["ward"],
         clean["department"], clean["doctor"], clean["admission_date"], pid),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM patients WHERE id = ?", (pid,)).fetchone()
    conn.close()
    return dict(row)


@app.delete("/api/patients/{pid}")
def delete_patient(pid: int):
    conn = get_db()
    cur = conn.execute("DELETE FROM patients WHERE id = ?", (pid,))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        return not_found()
    return {"message": "Patient deleted."}


@app.patch("/api/patients/{pid}/discharge")
def discharge_patient(pid: int):
    conn = get_db()
    cur = conn.execute("UPDATE patients SET status = 'Discharged' WHERE id = ?", (pid,))
    conn.commit()
    if cur.rowcount == 0:
        conn.close()
        return not_found()
    row = conn.execute("SELECT * FROM patients WHERE id = ?", (pid,)).fetchone()
    conn.close()
    return dict(row)
