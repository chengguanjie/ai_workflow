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
    // @ts-expect-error - test environment polyfill
    global.ResizeObserver = ResizeObserverMock

    const onTypeChange = vi.fn()
    render(<OutputTypeSelector selectedType="text" onTypeChange={onTypeChange} />)

    // Open dropdown
    fireEvent.mouseDown(screen.getByRole('combobox'))

    // Select JSON
    fireEvent.click(await screen.findByText('JSON'))

    expect(onTypeChange).toHaveBeenCalledWith('json')
  })
})

