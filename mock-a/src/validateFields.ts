import { validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

const validateFields = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if(!errors.isEmpty()) {
    res.status(400).json(errors);
    return;
  }

  next();
}

export default validateFields;