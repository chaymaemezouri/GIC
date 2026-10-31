import { PrismaClient } from '../generated/prisma/index.js';
import { extendWithWorkspace } from './workspace.js';

export const prisma = extendWithWorkspace(new PrismaClient());
