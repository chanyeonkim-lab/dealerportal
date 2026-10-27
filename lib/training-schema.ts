import { z } from 'zod';
export const courseSchema=z.object({title:z.string().trim().min(3).max(160),body:z.string().trim().min(30).max(12000),questions:z.array(z.object({question:z.string().trim().min(5).max(500),options:z.array(z.string().trim().min(1).max(300)).length(3),correct:z.number().int().min(0).max(2)})).length(3)});
export type Course=z.infer<typeof courseSchema>&{id:string};
