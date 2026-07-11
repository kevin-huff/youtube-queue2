import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '../../theme';
import JudgeSettings from '../JudgeSettings';

const renderWithTheme = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('JudgeSettings', () => {
  beforeAll(() => {
    // Mock clipboard for copy action to avoid errors in jsdom
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn()
      }
    });
  });

  test('updates judge name via API and calls onNameUpdate', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ session: { judgeName: 'New Judge' } })
    });

    const onNameUpdate = jest.fn();
    const channelName = 'testchannel';
    const cupId = 'cup123';
    const judgeToken = 'test-token';

    renderWithTheme(
      <JudgeSettings
        session={{ judgeName: 'Old Name' }}
        channelName={channelName}
        cupId={cupId}
        judgeToken={judgeToken}
        onNameUpdate={onNameUpdate}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /judge info/i }));

    const input = await screen.findByLabelText(/judge name/i);
    fireEvent.change(input, { target: { value: 'New Judge' } });
    fireEvent.click(screen.getByRole('button', { name: /update/i }));

    await screen.findByText(/name updated successfully/i);
    expect(onNameUpdate).toHaveBeenCalledWith('New Judge');
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/channels/${channelName}/cups/${cupId}/judge/name`,
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ Authorization: expect.stringContaining(judgeToken) })
      })
    );

    fetchMock.mockRestore();
  });
});
