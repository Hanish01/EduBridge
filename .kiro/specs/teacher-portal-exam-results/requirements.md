# Requirements Document

## Introduction

This feature covers three improvements to the EduBridge platform:

1. **Exam result persistence** – After a student completes an exam, the result (score, date, exam title) is saved to IndexedDB and displayed as a bar/line graph on the student page (`student.html`), giving students a visual history of their performance over time.

2. **Teacher portal layout redesign** – The current `teacher-portal.html` has duplicate "Upload Video" buttons (one in the main section, one in the Quick Actions sidebar) and a disorganised layout. The portal will be restructured into clear, distinct sections with no duplicate controls.

3. **Quiz creation section** – A dedicated, clearly labelled quiz creation form will be added to the teacher portal, separate from the exam creation link, so teachers can build practice quizzes directly from the portal without confusion.

## Glossary

- **Student_Page**: The `student.html` page where a logged-in student views their subjects, lessons, and quizzes.
- **Exam_Result**: A record containing exam ID, exam title, subject, score, total questions, percentage, and timestamp, produced when a student finishes an exam.
- **Result_Store**: The IndexedDB object store (`examResults`) inside `EduBridgeDB` used to persist Exam_Results locally in the browser.
- **Results_Graph**: A bar or line chart rendered on the Student_Page showing the student's score history across completed exams.
- **Teacher_Portal**: The `teacher-portal.html` page where an authenticated teacher manages lessons, exams, and quizzes.
- **Quiz_Form**: The HTML form on the Teacher_Portal used to create a new practice quiz and save it to Firestore.
- **Exam_Form_Link**: The link/button on the Teacher_Portal that navigates to `create-exam.html` for creating a formal exam.
- **EduBridgeDB**: The existing IndexedDB database (`EduBridgeDB`, version 3) defined in `db.js`.

---

## Requirements

### Requirement 1: Save Exam Results to IndexedDB

**User Story:** As a student, I want my exam results saved locally so that I can review my performance history even when offline.

#### Acceptance Criteria

1. WHEN a student completes an exam on `exam.html`, THE `exam.html` page SHALL save an Exam_Result record to the Result_Store in EduBridgeDB before rendering the result screen.
2. THE Exam_Result record SHALL contain: `examId`, `examTitle`, `subject`, `score` (number of correct answers), `total` (total questions), `percentage` (0–100 integer), `completedAt` (Unix timestamp in ms), and `forced` (boolean, true if auto-submitted due to violations).
3. THE Result_Store SHALL use `examId + '_' + completedAt` as the record key to allow multiple attempts for the same exam.
4. THE EduBridgeDB module (`db.js`) SHALL expose `addExamResult(result)` and `getExamResults()` functions that read and write to the Result_Store.
5. IF the IndexedDB write fails, THEN THE `exam.html` page SHALL still render the result screen without blocking the student.

---

### Requirement 2: Display Exam Results Graph on Student Page

**User Story:** As a student, I want to see a graph of my exam scores on my learning page so that I can track my progress at a glance.

#### Acceptance Criteria

1. WHEN the Student_Page loads and the student is authenticated, THE Student_Page SHALL read all Exam_Result records from the Result_Store and render the Results_Graph.
2. THE Results_Graph SHALL display one bar (or data point) per completed exam, with the exam title on the x-axis and the percentage score (0–100) on the y-axis.
3. WHEN the Result_Store contains no Exam_Result records, THE Student_Page SHALL display a placeholder message "No exam results yet. Take an exam to see your progress here." instead of the graph.
4. THE Results_Graph SHALL be rendered using only browser-native Canvas or SVG (no external charting library dependency) to keep the page lightweight and offline-compatible.
5. WHEN a student has more than 10 Exam_Result records, THE Results_Graph SHALL display only the 10 most recent results, ordered by `completedAt` ascending.
6. THE Results_Graph SHALL be visually accessible: bars/points SHALL use a colour with sufficient contrast against the background, and each bar SHALL have an `aria-label` or tooltip showing the exact score and date.

---

### Requirement 3: Redesign Teacher Portal Layout

**User Story:** As a teacher, I want a clean, organised portal layout so that I can find the right action quickly without confusion from duplicate buttons.

#### Acceptance Criteria

1. THE Teacher_Portal SHALL contain exactly one "Upload Video Lesson" button/link that navigates to `public/upload.html`.
2. THE Teacher_Portal SHALL contain exactly one "Create Exam" button/link that navigates to `create-exam.html`.
3. THE Teacher_Portal SHALL contain exactly one "View All Exams" button/link that navigates to `exam-list.html`.
4. THE Teacher_Portal layout SHALL organise content into three visually distinct sections: (a) Upload Lesson, (b) Create Quiz, and (c) Manage Exams — each with a clear heading.
5. WHEN the viewport width is 900px or less, THE Teacher_Portal sections SHALL stack vertically in a single column.
6. THE Teacher_Portal SHALL NOT render any form or input field that references a non-existent DOM element (i.e., no JavaScript errors caused by `getElementById` returning `null` for removed elements).

---

### Requirement 4: Add Quiz Creation Section to Teacher Portal

**User Story:** As a teacher, I want a dedicated quiz creation form on the portal so that I can build practice quizzes for students without navigating away.

#### Acceptance Criteria

1. THE Teacher_Portal SHALL include a Quiz_Form with the following fields: quiz title (text input, required), subject (select: Mathematics / Science / English, required), and questions (textarea using the existing pipe-delimited format `question | option1;option2;option3 | correctIndex`).
2. WHEN a teacher submits the Quiz_Form with a valid title and at least one valid question, THE Teacher_Portal SHALL save the quiz to the Firestore `quizzes` collection with fields: `title`, `subject`, `level` ("Class 9"), `createdByRole` ("teacher"), `teacherEmail`, `teacherName`, `createdAt`, and `questions`.
3. WHEN the Quiz_Form is submitted successfully, THE Teacher_Portal SHALL clear the form fields and display a success message "Quiz saved. Students can see it under Practice Quizzes."
4. IF the teacher submits the Quiz_Form with an empty title or zero valid questions, THEN THE Teacher_Portal SHALL display an inline validation message "Please enter a title and at least one valid question." without submitting to Firestore.
5. IF the Firestore write fails, THEN THE Teacher_Portal SHALL display an error message "Error saving quiz. Please try again." and re-enable the submit button.
6. THE Quiz_Form section SHALL be visually separated from the Exam_Form_Link section so that teachers can clearly distinguish between creating a practice quiz and creating a formal exam.
7. THE Quiz_Form submit button SHALL be disabled while a save operation is in progress to prevent duplicate submissions.
