import { PrismaClient } from '@prisma/client';
import { extendWithWorkspace } from './workspace.js';

export const prisma = extendWithWorkspace(new PrismaClient());
