import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface AlbumPage {
  active: {
    filter: string;
  };
}

const initialState: AlbumPage = {
  active: {
    filter: 'random',
  },
};

const albumSlice = createSlice({
  name: 'album',
  initialState,
  reducers: {
    setActive: (state, action: PayloadAction<{ filter: string }>) => {
      state.active.filter = action.payload.filter;
    },
  },
});

export const { setActive } = albumSlice.actions;
export default albumSlice.reducer;
