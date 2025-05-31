# 🟢 Changelog — Orvia

## [1.0.1] — 2025-05-30

### ✅ Implemented
- Filter employee by location
- Confirmation dialog before regenerating schedule

### 🔧 In progress
- Informative dashboard
    - Current date
    - Workers on shift today

### 📋 TODO
- Cursor loading state during system actions
- Dev test account setup with scaling-proof logic
- Soft delete/database cleanup script
- More dashboard content
- Add support for additional employee personal data fields (and potential layout refactoring)

---

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
- Soft delete/database cleanup script
- More dashboard content
- Add support for additional employee personal data fields (and potential layout refactoring)


---

## 🧩 Known Behaviors
- If a worker is active in multiple locations, at least one location should use recurring shifts for better load balancing
- If a worker is deleted from a recurring assignment, the worker is not eligible to be reassigned to the same shift

## 📍 Future Enhancements
- UI revamp
- Optional database type enforcement
- Conditional schedule generation with user prefill