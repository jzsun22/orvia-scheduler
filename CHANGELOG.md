# 🟢 Changelog — Orvia

## [1.0.0] — 2025-05-26

### ✅ Implemented
- Automatic shift generation
- Manual shift editing
- Multi-location support
- Recurring shift assignments
- User authentication

### 🛠️ TODO
- Filter employee by location
- Confirmation dialog before regenerating schedule
- Cursor loading state during system actions
- Dev test account setup with scaling-proof logic
- soft delete/database cleanup script


---

## 🧩 Known Behaviors
- If a worker is active in multiple locations, at least one location should use recurring shifts for better load balancing
- If a worker is deleted from a recurring assignment, the worker is not eligible to be reassigned to the same shift

## 📍 Future Enhancements
- UI revamp
- Optional database type enforcement
- Conditional schedule generation with user prefill