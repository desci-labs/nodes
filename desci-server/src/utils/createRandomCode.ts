import * as crypto from 'crypto';

const LENGTH = 6;
const createRandomCode = (): string => {
  return `${crypto.randomInt(10 ** (LENGTH - 1), 10 ** LENGTH - 1)}`.substring(0, LENGTH).padStart(LENGTH, '0');
};

export default createRandomCode;
