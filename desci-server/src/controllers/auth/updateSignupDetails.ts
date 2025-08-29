import { Response } from 'express';
import { AuthenticatedRequest } from '../../core/types.js';
import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';

/**
 * Updates user profile with signup form details (firstName, lastName, role, source)
 */
export const updateSignupDetails = async (req: AuthenticatedRequest, res: Response) => {
  const { firstName, lastName, role, source, otherSource } = req.body;
  const logger = parentLogger.child({ 
    module: 'AUTH::UpdateSignupDetails', 
    userId: req.user.id 
  });

  try {
    // Construct the full name from firstName and lastName
    const name = [firstName, lastName].filter(Boolean).join(' ');
    
    // Use otherSource if source is OTHER, otherwise use source
    const finalSource = source === 'OTHER' ? otherSource : source;

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        firstName: firstName || null,
        lastName: lastName || null,
        name: name || null,
        role: role || null,
        source: finalSource || null,
      },
    });

    logger.info({ 
      userId: req.user.id, 
      firstName: !!firstName,
      lastName: !!lastName,
      role: !!role,
      source: !!finalSource 
    }, 'Updated user signup details');

    res.send({ 
      ok: true, 
      user: {
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        name: updatedUser.name,
        role: updatedUser.role,
        source: updatedUser.source,
      }
    });
  } catch (error) {
    logger.error({ error }, 'Failed to update user signup details');
    res.status(400).send({ ok: false, message: 'Failed to update user details' });
  }
};