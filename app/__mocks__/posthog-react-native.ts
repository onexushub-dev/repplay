// Jest stand-in for the PostHog SDK: records how it was built and what it was asked to send, so tests load
// src/analytics without native code or a network.
export class PostHog {
  static instances: PostHog[] = [];
  readonly capture = jest.fn();

  constructor(
    readonly apiKey: string,
    readonly options: Record<string, unknown>,
  ) {
    PostHog.instances.push(this);
  }
}

export default PostHog;
