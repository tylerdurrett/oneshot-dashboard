import { describe, expect, it } from 'vitest';

import {
  Button,
  buttonVariants,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
  Conversation,
  ConversationContent,
  Input,
  Message,
  MessageContent,
  MessageResponse,
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from '../index';

describe('component exports', () => {
  it('exports Button and buttonVariants', () => {
    expect(Button).toBeDefined();
    expect(buttonVariants).toBeDefined();
  });

  it('exports Input', () => {
    expect(Input).toBeDefined();
  });

  it('exports Card and its sub-components', () => {
    expect(Card).toBeDefined();
    expect(CardHeader).toBeDefined();
    expect(CardTitle).toBeDefined();
    expect(CardDescription).toBeDefined();
    expect(CardAction).toBeDefined();
    expect(CardContent).toBeDefined();
    expect(CardFooter).toBeDefined();
  });

  it('exports cn utility', () => {
    expect(cn).toBeDefined();
  });

  it('exports Conversation and its sub-components', () => {
    expect(Conversation).toBeDefined();
    expect(ConversationContent).toBeDefined();
  });

  it('exports Message and its sub-components', () => {
    expect(Message).toBeDefined();
    expect(MessageContent).toBeDefined();
    expect(MessageResponse).toBeDefined();
  });

  it('exports PromptInput and its sub-components', () => {
    expect(PromptInput).toBeDefined();
    expect(PromptInputTextarea).toBeDefined();
    expect(PromptInputSubmit).toBeDefined();
  });
});
