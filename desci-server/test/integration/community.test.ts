import 'dotenv/config';
import 'mocha';

describe('Desci Communities', () => {
  describe('Creating a community', () => {
    it('should create a community', () => {});
    it('should assign creator as admin', () => {});
    it('should assign creator as admin', () => {});
  });

  describe('Updating a community', () => {
    it('should update community', () => {});
  });

  describe('Community Membership', () => {
    it('should add a member', () => {});
    it('should remove a member', () => {});
    it('should restrict updates to admin');
    it('should prevent removal of admin', () => {});
  });

  describe('Community Feed', () => {
    it('should endorse a node', () => {});
    it('should display endorsed nodes in community feed', () => {});
    it('should remove an endorsed node', () => {});
  });

  describe('Attestation', () => {
    describe('Create Community Attestation', () => {});
    describe('Create Community Attestation From Template', () => {});
    describe('Update Community Attestation', () => {});
    describe('Community Member Attestation', () => {});

    describe('Community Selected Attestation', () => {
      it('should add attestation to community', () => {});
      it('should only allow members who claim entry requirement attestation(s)', () => {});
      it('should allow member to claim all selected attestation(s)', () => {});
      it('should allow member claim individual attestation(s)', () => {});
    });
  });
});
