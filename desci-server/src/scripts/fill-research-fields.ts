import dotenv from 'dotenv';

import prisma from 'client';

dotenv.config({ path: '../.env' });
import researchFieldsData from '../../data/fields.json';

const main = async () => {
  const parsedFields: { name: string }[] = researchFieldsData.map((name) => ({ name }));

  const fields = await prisma.researchFields.createMany({ data: parsedFields, skipDuplicates: true });
  console.log('Research fields inserted', fields.count);
};

main()
  .then((result) => console.log('Research fields created', result))
  .catch((err) => console.log('Error running script ', err));
