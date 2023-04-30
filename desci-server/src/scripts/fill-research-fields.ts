import prisma from 'client';

const main = async () => {
  const researchFieldsData = require('../../data/fields.json');
  const parsedFields: { name: string }[] = researchFieldsData.map((name) => ({ name }));

  const fields = await prisma.researchFields.createMany({ data: parsedFields, skipDuplicates: true });
  console.log('Research fields inserted', fields.count);
};

main()
  .then((result) => console.log('Research fields created', result))
  .catch((err) => console.log('Error running script ', err));
