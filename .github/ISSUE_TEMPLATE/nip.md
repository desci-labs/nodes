name: 'Improvement Proposal'
description: 'Propose a relevant change or feature request'
body:
  - type: 'textarea'
    id: 'description'
    attributes:
      label: 'Description'
      description: 'A clear and concise description of what could be improved'
      placeholder: |
        Bug description
    validations:
      required: true
  - type: 'textarea'
    id: 'additional-information'
    attributes:
      label: 'Additional Information'
      description: |
        Add any other context here.
