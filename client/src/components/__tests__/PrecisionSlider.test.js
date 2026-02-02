import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PrecisionSlider from '../PrecisionSlider';

const renderWithState = (initial = 3.14159) => {
  const Wrapper = () => {
    const [val, setVal] = React.useState(initial);
    return <PrecisionSlider value={val} onChange={setVal} />;
  };
  return render(<Wrapper />);
};

describe('PrecisionSlider', () => {
  test('shows value with 5 decimals', () => {
    renderWithState(2.5);
    expect(screen.getByRole('heading', { name: '2.50000' })).toBeInTheDocument();
  });

  test('quick set buttons update value', () => {
    renderWithState(1);
    fireEvent.click(screen.getByRole('button', { name: '4' }));
    expect(screen.getByRole('heading', { name: '4.00000' })).toBeInTheDocument();
  });

  test('input clamps and formats on blur', () => {
    renderWithState(1);
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '6' } }); // above max
    fireEvent.blur(input);
    expect(screen.getByRole('heading', { name: '5.00000' })).toBeInTheDocument(); // clamped to max
  });
});
