import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const referenceSchema = z.object({
  approvedVersion: z.number().int().positive(),
  file: z.string().regex(/^simplified-ui-v\d+\.html$/u),
  approvedAt: z.string().date(),
  description: z.string().min(1),
});

export interface PrototypeReference {
  approvedVersion: number;
  file: string;
  approvedAt: string;
  description: string;
  absolutePath: string;
}

export async function approvedPrototype(root: string): Promise<PrototypeReference> {
  const prototypeDirectory = path.resolve(root, '../..', 'prototypes', 'extention');
  const raw = await readFile(path.join(prototypeDirectory, 'reference.json'), 'utf8');
  const reference = referenceSchema.parse(JSON.parse(raw));
  const expectedFile = `simplified-ui-v${String(reference.approvedVersion)}.html`;
  if (reference.file !== expectedFile) {
    throw new Error(
      `Prototype reference mismatch: version ${String(reference.approvedVersion)} must point to ${expectedFile}.`,
    );
  }

  const files = await readdir(prototypeDirectory);
  const versions = files
    .map((file) => /^simplified-ui-v(\d+)\.html$/u.exec(file)?.[1])
    .filter((version): version is string => Boolean(version))
    .map(Number);
  const newestVersion = Math.max(...versions);
  if (newestVersion !== reference.approvedVersion) {
    throw new Error(
      `Prototype reference is stale: v${String(newestVersion)} exists but reference.json approves v${String(reference.approvedVersion)}.`,
    );
  }

  const absolutePath = path.join(prototypeDirectory, reference.file);
  await access(absolutePath);
  return { ...reference, absolutePath };
}
