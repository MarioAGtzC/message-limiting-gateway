import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { messageQueue } from '../config/queue';

export const processMessage = async (req: Request, res: Response) => {
  const { id, content, recipient } = req.body;

  const existing = await prisma.message.findUnique({ where: { id } });
  if (existing) {
    return res.status(200).json({ message: 'Mensaje ya recibido anteriormente' });
  }

  await prisma.message.create({
    data: { id, content, recipient }
  });

  await messageQueue.add('send', { id, content, recipient });

  return res.status(202).json({ message: 'Mensaje recibido' });
}

export const getMessage = async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const message = await prisma.message.findUnique({ where: { id } });

  if (!message) {
    return res.status(404).json({ error: 'Mensaje no encontrado' });
  }

  return res.status(200).json(message);
}

export const getStats = async (req: Request, res: Response) => {
  const stats = await prisma.message.groupBy({
    by: ['status'],
    _count: { status: true }
  });

  return res.status(200).json(
    stats.reduce((acc, curr) => {
      acc[curr.status.toLowerCase()] = curr._count.status;
      return acc;
    }, {} as Record<string, number>)
  );
}