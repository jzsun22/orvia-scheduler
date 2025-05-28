# Orvia — Smart Shift Scheduling for Multi-Location Stores

**Orvia** is a web-based scheduling tool built to streamline shift planning for store managers overseeing multiple locations. It automates weekly shift generation using worker availability, predefined role templates, and conflict-prevention logic — while supporting manual edits when needed.

---

## 🔑 Key Features

- **Automated Schedule Generation**  
  Create weekly shift plans based on worker availability, role requirements, and template rules.

- **Multi-Location Support**  
  Prevents scheduling conflicts across locations and adapts to store-specific staffing needs.

- **Template-Driven Shifts**  
  Define shifts by role, location, time window, and lead designation for consistency.

- **Conflict Validation**  
  Enforces one shift per worker per day, filters out inactive or soft-deleted workers, and avoids location overlaps.

- **Manual Adjustments**  
  Easily override or fine-tune schedules via a flexible UI after generation.

---

## 🛠️ Technology Overview

- **Frontend**: [Next.js](https://nextjs.org/) + TypeScript + Tailwind CSS  
- **Backend**: [Supabase](https://supabase.com/) (PostgreSQL + Edge Functions)  
- **Authentication**: Supabase Auth with Row-Level Security (RLS)  
- **Scheduling Logic**: Runs entirely in the browser using JavaScript

---

## 📦 Project Structure

```
Orvia
├── supabase/                                 # Supabase function specific files
│   ├── functions/                            # Serverless functions deployed to Supabase Edge
│   ├── migrations/                                                        
│   └── import_map.json
├── src/                                                                   
│   ├── app/                                                              
│   │   ├── api/                                                           
│   │   ├── dashboard/                                                     
│   │   ├── employees/                                                     
│   │   ├── login/                                                         
│   │   └── schedule/                                                     
│   │       └── [location]/                   # Dynamic route, location-specifc                                                  
│   ├── components/                                                        
│   │   ├── layout/                                                        
│   │   ├── modals/                           # Modal dialog components
│   │   ├── scheduling/                       # Components specific to the scheduling features
│   │   ├── select/                           # Custom select/dropdown components
│   │   └── ui/                                                            
│   ├── hooks/                                # Custom React hooks for shared logic and state management
│   ├── lib/                                                               
│   │   ├── db/                               # Database-related utilities and helper functions
│   │   ├── scheduling/                       # Core logic for schedule generation and manipulation
│   │   ├── schemas/                          # Data validation schemas 
│   │   ├── supabase/                         # Supabase client    
│   │   ├── supabase.ts                       # Supabase helper functions
│   │   ├── types.ts
│   │   └── utils.ts
│   ├── styles/                                                            
│   ├── types/                                                             
└── public/                                   # Static assets
``` 

---

## 👀 Status

Orvia is currently in its MVP phase with active development. Though tailored for a specific operational context, it is architected for future scalability and broader applications in workforce scheduling.

---

## 📬 Contact

Created by **Jocelyn** — UX/Product Designer & Indie Developer.  
For questions or feedback, connect via [LinkedIn](https://www.linkedin.com/in/jzsun2).
