import { z } from 'zod';
import { database } from './db';
import { quizQuestions } from './domain';
import { courseSchema } from './training-schema';
import type { Course } from './training-schema';
export { courseSchema };
export type { Course };
function conn(){const db=database();db.exec(`CREATE TABLE IF NOT EXISTS courses(id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, questions TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS training_events(id TEXT PRIMARY KEY, learner TEXT NOT NULL, course_id TEXT NOT NULL, type TEXT NOT NULL, score INTEGER, total INTEGER, answers TEXT, created_at TEXT NOT NULL);`);
 db.prepare('INSERT OR IGNORE INTO courses VALUES (?, ?, ?, ?)').run('AU01','EV sales essentials','Ask about everyday journeys, longer trips, passengers, luggage and charging access. Confirm priorities before recommending a feature.\n\nRange: A published test-cycle figure is for comparison, not a guarantee in winter. Weather, speed, heating, load and driving style affect actual range. Check routes and charging options.\n\nCharging: Separate home AC charging from public DC rapid charging. Check the exact Australian vehicle, battery, power supply and installation before quoting a time.\n\nWalk-around: Link two relevant features to needs, invite a practical check, and agree a test drive with a clear purpose.\n\nDemo guidance, not official Hyundai training. No Australian trim specifications are verified.',JSON.stringify(quizQuestions.map((q,i)=>({...q,correct:[1,0,2][i]}))));return db;}
export function courses():Course[]{return conn().prepare('SELECT * FROM courses').all().map(r=>({id:String(r.id),title:String(r.title),body:String(r.body),questions:JSON.parse(String(r.questions))}));}
export function publicCourses(){return courses().map(c=>({...c,questions:c.questions.map(({question,options})=>({question,options}))}));}
export function addCourse(course:z.infer<typeof courseSchema>){const id=crypto.randomUUID();conn().prepare('INSERT INTO courses VALUES (?, ?, ?, ?)').run(id,course.title,course.body,JSON.stringify(course.questions));return id;}
export function recordParticipation(courseId:string){if(!courses().some(c=>c.id===courseId))throw Error('Unknown course');conn().prepare('INSERT INTO training_events VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(),'Jamie Taylor',courseId,'opened',null,null,null,new Date().toISOString());}
export function submitAttempt(courseId:string,answers:number[]){const course=courses().find(c=>c.id===courseId);if(!course)throw Error('Unknown course');const feedback=course.questions.map((q,i)=>({correct:answers[i]===q.correct,answer:q.correct})),score=feedback.filter(f=>f.correct).length;conn().prepare('INSERT INTO training_events VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(),'Jamie Taylor',courseId,'quiz_submitted',score,3,JSON.stringify(answers),new Date().toISOString());return{score,total:3,feedback};}
export function trainingReport(){return conn().prepare('SELECT * FROM training_events ORDER BY created_at DESC').all();}
