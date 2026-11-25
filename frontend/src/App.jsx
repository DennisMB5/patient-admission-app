import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const today = () => new Date().toISOString().split("T")[0];

const emptyForm = {
  name: "",
  age: "",
  gender: "",
  ward: "",
  department: "",
  doctor: "",
  admission_date: "",
};

// ---------- Frontend validation (same rules as backend) ----------
function validate(f) {
  const e = {};
  if (!f.name.trim()) e.name = "Name is required.";
  else if (!/^[A-Za-z]+( [A-Za-z]+)*$/.test(f.name.trim()))
    e.name = "Name must contain letters only.";

  if (f.age === "" || f.age === null) e.age = "Age is required.";
  else if (!Number.isInteger(Number(f.age)) || Number(f.age) < 0 || Number(f.age) > 120)
    e.age = "Age must be a whole number between 0 and 120.";

  ["gender", "ward", "department", "doctor"].forEach((k) => {
    if (!f[k]) e[k] = `${k.charAt(0).toUpperCase() + k.slice(1)} is required.`;
  });

  if (!f.admission_date) e.admission_date = "Admission date is required.";
  else if (f.admission_date > today())
    e.admission_date = "Admission date cannot be in the future.";

  return e;
}

// ---------- Reusable select dropdown ----------
function Select({ label, name, value, options, onChange, error, placeholder }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select name={name} value={value} onChange={onChange}>
        <option value="">{placeholder || `Select ${label}`}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      {error && <small className="error">{error}</small>}
    </label>
  );
}

// ---------- Add / Edit form (shown in a popup) ----------
function PatientForm({ options, initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || emptyForm);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    setServerError("");
    if (Object.keys(found).length > 0) return; // stop if frontend validation fails

    const result = await onSave(form);
    if (result && result.errors) setErrors(result.errors); // errors from backend
    else if (result && result.error) setServerError(result.error);
  };

  return (
    <div className="overlay">
      <form className="modal" onSubmit={handleSubmit} noValidate>
        <h2>{initial ? "Edit Patient" : "Add Patient"}</h2>

        <label className="field">
          <span>Name</span>
          <input name="name" value={form.name} onChange={handleChange} placeholder="Full name" />
          {errors.name && <small className="error">{errors.name}</small>}
        </label>

        <label className="field">
          <span>Age</span>
          <input name="age" type="number" value={form.age} onChange={handleChange} placeholder="0 - 120" />
          {errors.age && <small className="error">{errors.age}</small>}
        </label>

        <Select label="Gender" name="gender" value={form.gender} options={options.genders} onChange={handleChange} error={errors.gender} />
        <Select label="Ward" name="ward" value={form.ward} options={options.wards} onChange={handleChange} error={errors.ward} />
        <Select label="Department" name="department" value={form.department} options={options.departments} onChange={handleChange} error={errors.department} />
        <Select label="Doctor" name="doctor" value={form.doctor} options={options.doctors} onChange={handleChange} error={errors.doctor} />

        <label className="field">
          <span>Admission Date</span>
          <input name="admission_date" type="date" max={today()} value={form.admission_date} onChange={handleChange} />
          {errors.admission_date && <small className="error">{errors.admission_date}</small>}
        </label>

        {serverError && <p className="error">{serverError}</p>}

        <div className="actions">
          <button type="button" className="btn grey" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn blue">Save</button>
        </div>
      </form>
    </div>
  );
}

// ---------- Main App ----------
export default function App() {
  const [patients, setPatients] = useState([]);
  const [options, setOptions] = useState({ genders: [], wards: [], departments: [], doctors: [] });
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ ward: "", department: "", doctor: "" });
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // patient being edited
  const [toDelete, setToDelete] = useState(null); // patient waiting for delete confirmation
  const [loadError, setLoadError] = useState("");

  // Load dropdown options once
  useEffect(() => {
    fetch(`${API}/api/options`)
      .then((r) => r.json())
      .then(setOptions)
      .catch(() => setLoadError("Cannot reach the server."));
  }, []);

  // Load patients whenever search or filters change
  const loadPatients = () => {
    const params = new URLSearchParams({ search, ...filters });
    fetch(`${API}/api/patients?${params}`)
      .then((r) => r.json())
      .then(setPatients)
      .catch(() => setLoadError("Cannot reach the server."));
  };
  useEffect(loadPatients, [search, filters]);

  // Save = add (POST) or edit (PUT). Returns error object if backend rejects.
  const savePatient = async (form) => {
    const url = editing ? `${API}/api/patients/${editing.id}` : `${API}/api/patients`;
    const res = await fetch(url, {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) return data;
    closeForm();
    loadPatients();
  };

  const confirmDelete = async () => {
    await fetch(`${API}/api/patients/${toDelete.id}`, { method: "DELETE" });
    setToDelete(null);
    loadPatients();
  };

  const discharge = async (p) => {
    await fetch(`${API}/api/patients/${p.id}/discharge`, { method: "PATCH" });
    loadPatients();
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const openEdit = (p) => {
    setEditing(p);
    setShowForm(true);
  };

  const setFilter = (e) => setFilters({ ...filters, [e.target.name]: e.target.value });
  const clearFilters = () => {
    setSearch("");
    setFilters({ ward: "", department: "", doctor: "" });
  };

  return (
    <div className="container">
      <header>
        <h1>🏥 Patient Admission Management</h1>
        <button className="btn blue" onClick={() => setShowForm(true)}>+ Add Patient</button>
      </header>

      {loadError && <p className="error">{loadError}</p>}

      {/* Search + filters */}
      <div className="toolbar">
        <input
          className="search"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select name="ward" value={filters.ward} onChange={setFilter}>
          <option value="">All Wards</option>
          {options.wards.map((o) => <option key={o}>{o}</option>)}
        </select>
        <select name="department" value={filters.department} onChange={setFilter}>
          <option value="">All Departments</option>
          {options.departments.map((o) => <option key={o}>{o}</option>)}
        </select>
        <select name="doctor" value={filters.doctor} onChange={setFilter}>
          <option value="">All Doctors</option>
          {options.doctors.map((o) => <option key={o}>{o}</option>)}
        </select>
        <button className="btn grey" onClick={clearFilters}>Clear</button>
      </div>

      {/* Patient list (table on desktop, cards on mobile via CSS) */}
      {patients.length === 0 ? (
        <p className="empty">No patients found.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Age</th><th>Gender</th><th>Ward</th>
              <th>Department</th><th>Doctor</th><th>Admitted</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {patients.map((p) => (
              <tr key={p.id}>
                <td data-label="Name">{p.name}</td>
                <td data-label="Age">{p.age}</td>
                <td data-label="Gender">{p.gender}</td>
                <td data-label="Ward">{p.ward}</td>
                <td data-label="Department">{p.department}</td>
                <td data-label="Doctor">{p.doctor}</td>
                <td data-label="Admitted">{p.admission_date}</td>
                <td data-label="Status">
                  <span className={`badge ${p.status === "Admitted" ? "green" : "orange"}`}>{p.status}</span>
                </td>
                <td data-label="Actions" className="row-actions">
                  <button className="btn small blue" onClick={() => openEdit(p)}>Edit</button>
                  {p.status === "Admitted" && (
                    <button className="btn small teal" onClick={() => discharge(p)}>Discharge</button>
                  )}
                  <button className="btn small red" onClick={() => setToDelete(p)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Add / Edit popup */}
      {showForm && (
        <PatientForm
          options={options}
          initial={editing}
          onSave={savePatient}
          onCancel={closeForm}
        />
      )}

      {/* Delete confirmation popup */}
      {toDelete && (
        <div className="overlay">
          <div className="modal">
            <h2>Delete patient?</h2>
            <p>Are you sure you want to delete <b>{toDelete.name}</b>? This cannot be undone.</p>
            <div className="actions">
              <button className="btn grey" onClick={() => setToDelete(null)}>Cancel</button>
              <button className="btn red" onClick={confirmDelete}>Yes, Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
