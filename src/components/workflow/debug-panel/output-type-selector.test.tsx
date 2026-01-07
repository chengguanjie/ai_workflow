import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { OutputTypeSelector } from './output-type-selector'

// Radix UI components rely on ResizeObserver in the browser.
// JSDOM doesn't provide it by default.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('OutputTypeSelector', () => {
  it('calls onTypeChange when selecting a new type', async () => {
    const onTypeChange = vi.fn()
    render(<OutputTypeSelector selectedType="text" onTypeChange={onTypeChange} />)

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'json' } })

    expect(onTypeChange).toHaveBeenCalledWith('json')
  })
})
