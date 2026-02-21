export interface MockMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Simulates a "birth the bot" onboarding conversation.
 * Covers: plain text, longer paragraphs, markdown lists, and agent questions.
 */
export const mockMessages: MockMessage[] = [
  {
    id: 'msg-1',
    role: 'assistant',
    content:
      "Hey there! I'm your new AI assistant. I'm excited to get to know you and help you build something great. What's your name?",
  },
  {
    id: 'msg-2',
    role: 'user',
    content: 'Hi! My name is Alex.',
  },
  {
    id: 'msg-3',
    role: 'assistant',
    content:
      "Nice to meet you, Alex! Before we dive in, I'd love to understand what you're hoping to accomplish. What kind of project are you working on, and what are your main goals?",
  },
  {
    id: 'msg-4',
    role: 'user',
    content:
      "I'm building a dashboard for my small business. I want to track sales, manage inventory, and get a quick overview of how things are going each day.",
  },
  {
    id: 'msg-5',
    role: 'assistant',
    content:
      "That sounds like a really useful project! Based on what you've described, here's what I'd suggest we focus on first:\n\n- **Sales tracking** — a simple view of daily and weekly revenue\n- **Inventory management** — add, edit, and monitor stock levels\n- **Daily overview** — a dashboard home page with key metrics at a glance\n\nWe can start with whichever feels most important to you. Which one would you like to tackle first?",
  },
  {
    id: 'msg-6',
    role: 'user',
    content: "Let's start with the daily overview. I want to see the big picture first.",
  },
  {
    id: 'msg-7',
    role: 'assistant',
    content:
      "Great choice. The daily overview will give you immediate value and help us figure out what data matters most.\n\nHere's a rough idea of what the dashboard home could include:\n\n1. **Today's revenue** compared to yesterday\n2. **Orders placed** in the last 24 hours\n3. **Low stock alerts** for items running below threshold\n4. A small **sales chart** showing the last 7 days\n\nDoes that sound like the right starting point, or would you add or remove anything from that list?",
  },
  {
    id: 'msg-8',
    role: 'user',
    content:
      'That looks perfect. Could we also add a section for recent customer messages? I get a lot of inquiries and sometimes miss them.',
  },
  {
    id: 'msg-9',
    role: 'assistant',
    content:
      "Absolutely — a **recent messages** section is a great addition. We'll put it right below the key metrics so you never miss an inquiry.\n\nAlright, I have a clear picture now. Let me start putting together the layout for your daily overview dashboard. I'll check in with you as I go so we can refine it together. Sound good?",
  },
];
