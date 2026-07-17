import { z } from 'zod';

const nullableText = z.string().trim().max(5000).nullable().default(null);
const confidence = z.number().int().min(0).max(100).nullable().default(null);
const namedItem = z.object({
  name: z.string().trim().min(1).max(500),
  category: nullableText,
  importance: z.enum(['Required', 'Preferred', 'Optional']).nullable().default(null),
  confidence,
});
const textItem = z.object({ text: z.string().trim().min(1).max(3000), confidence });
const namedList = z.array(namedItem).max(150).default([]);
const textList = z.array(textItem).max(150).default([]);

export const jobSchema = z.object({
  company: z.object({ name: nullableText, confidence }),
  job: z.object({
    title: nullableText, department: nullableText, employmentType: nullableText,
    experience: z.object({ display: nullableText, minYears: z.number().min(0).max(99).nullable().default(null), maxYears: z.number().min(0).max(99).nullable().default(null), confidence }),
  }),
  location: z.object({
    city: nullableText, state: nullableText, country: nullableText, remote: z.boolean().nullable().default(null),
    hybrid: z.boolean().nullable().default(null), onsite: z.boolean().nullable().default(null),
    relocation: z.boolean().nullable().default(null), travelRequirement: nullableText, confidence,
  }),
  education: textList, certifications: textList, skills: namedList, technologies: namedList, tools: namedList,
  frameworks: namedList, databases: namedList, cloud: namedList, softSkills: namedList,
  responsibilities: textList, qualifications: textList, benefits: textList, languages: namedList,
  salary: z.object({ value: nullableText, currency: nullableText, confidence }).nullable().default(null),
  metadata: z.object({ url: nullableText, source: nullableText, postedDate: nullableText, deadline: nullableText, confidence }),
}).passthrough();
