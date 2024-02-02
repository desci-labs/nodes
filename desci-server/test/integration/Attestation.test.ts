import 'dotenv/config';
import 'mocha';

describe('Community Attestations', () => {
  describe('Claiming an Attestation', () => {
    it('should claim an attestaion to a node', () => {});
    it('should add author to a community membership', () => {});
    it('should assign attestation to correct node version', () => {});
    it('should add node to community feed', () => {});
  });

  describe('UnClaiming an Attestation', () => {
    it('should unclaim an attestaion from a node', () => {});
    it('should remove/hide node from community feed if entry requirement is not met', () => {});
    it('should assign attestation to correct node version', () => {});
  });

  describe('Reacting to a Node Attestation', () => {
    it('should react to a node attestation', () => {});
    it('should remove reaction to a node attestation', () => {});
  });

  describe('Node Attestation Comments', () => {
    it('should comment to a node attestation', () => {});
    it('should remove comment to a node attestation', () => {});
  });

  describe('Node Attestation Verification', () => {
    it('should allow member verify a node attestation', () => {});
    it('should restrict author from verifying their claim', () => {});
  });

  describe('Node Attestation Engagement', () => {
    it('should curate all node impressions across all attestaions', () => {});
    it('should list all engaging users and only count users once', () => {});
  });
});
