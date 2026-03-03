// src/stories/LandingPage.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import LandingPage from "../components/LandingPage";
import { SocketContext } from "@/contexts/SocketContext";

const meta: Meta<typeof LandingPage> = {
  title: "Screens/LandingPage",
  component: LandingPage,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof LandingPage>;

const mockSocket = {
  emit: () => {},
  on: () => {},
  off: () => {},
  connected: true,
};

export const Default: Story = {
  decorators: [
    (Story) => (
      <SocketContext.Provider value={{ socket: mockSocket as any, connect: () => {}, disconnect: () => {} }}>
        <Story />
      </SocketContext.Provider>
    ),
  ],
  args: {
    onJoinGame: (code: string) => console.log("join", code),
  },
};